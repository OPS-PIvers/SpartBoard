import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';
import {
  clearPendingQuizCopy,
  listPendingQuizCopyBatches,
} from './paperBatchStore';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {} }));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

describe('paperBatchStore — deferred teammate copies (D20)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked(firestore.collection).mockReturnValue('paper_batches');
    mocked(firestore.doc).mockReturnValue('batch-ref');
    mocked(firestore.orderBy).mockImplementation((...a: unknown[]) => ({
      __orderBy: a,
    }));
    mocked(firestore.limit).mockImplementation((n: number) => ({ __limit: n }));
    mocked(firestore.query).mockImplementation((...a: unknown[]) => ({
      __query: a,
    }));
    mocked(firestore.getDocs).mockResolvedValue({ docs: [] });
    mocked(firestore.updateDoc).mockResolvedValue(undefined);
    mocked(firestore.deleteField).mockReturnValue('DELETE');
  });

  it('scans only batches carrying the marker, and bounds the read', async () => {
    await listPendingQuizCopyBatches('teacher-1');
    // A doc without `pendingQuizCopy` is absent from this index, so a library
    // with no deferred stacks reads nothing.
    expect(firestore.orderBy).toHaveBeenCalledWith(
      'pendingQuizCopy.requestedAt'
    );
    expect(firestore.limit).toHaveBeenCalled();
    expect(mocked(firestore.limit).mock.calls[0][0]).toBeGreaterThan(0);
  });

  it('binds the batch to the copy and drops the marker in one write', async () => {
    await clearPendingQuizCopy('teacher-1', 'batch-1', 'quiz-1');
    expect(firestore.updateDoc).toHaveBeenCalledWith('batch-ref', {
      quizId: 'quiz-1',
      pendingQuizCopy: 'DELETE',
    });
  });
});
