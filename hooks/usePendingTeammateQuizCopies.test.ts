import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';
import type { PaperBatch } from '@/types';
import {
  reconcilePendingQuizCopies,
  type QuizReplicaWriter,
} from './usePendingTeammateQuizCopies';
import * as batchStore from '@/utils/paperBatchStore';
import * as syncedGroups from '@/hooks/useSyncedQuizGroups';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/utils/paperBatchStore');
vi.mock('@/hooks/useSyncedQuizGroups');

const UID = 'teacher-1';
const GROUP_ID = 'group-1';
const QUIZ_ID = 'reserved-quiz-id';

const pendingBatch = (overrides: Partial<PaperBatch> = {}): PaperBatch =>
  ({
    id: 'batch-1',
    quizId: QUIZ_ID,
    rosterIds: ['r1'],
    questionCount: 3,
    choiceCount: 4,
    seats: {},
    spareSeats: [1, 2],
    pagesPerSheet: 1,
    createdAt: 10,
    printedByUid: 'peer-1',
    printedByName: 'Sarah Cole',
    pendingQuizCopy: {
      groupId: GROUP_ID,
      plcId: 'plc-1',
      plcQuizId: 'plc-quiz-1',
      title: 'Vocab Formative Check',
      requestedByName: 'Sarah Cole',
      requestedAt: 10,
    },
    ...overrides,
  }) as PaperBatch;

const drive = (): QuizReplicaWriter & {
  saveQuiz: ReturnType<typeof vi.fn>;
} => ({
  saveQuiz: vi.fn().mockResolvedValue('drive-file-1'),
});

/** `getDocs` answers the "do they already hold a copy?" lookup. */
const libraryHolds = (quizId: string | null) => {
  (firestore.getDocs as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    docs: quizId ? [{ id: quizId }] : [],
  });
};

describe('reconcilePendingQuizCopies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (
      firestore.collection as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue('quizzes');
    (firestore.doc as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (...args: unknown[]) => ({ __doc: args })
    );
    (firestore.query as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (...args: unknown[]) => ({ __query: args })
    );
    (firestore.where as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (...args: unknown[]) => ({ __where: args })
    );
    (firestore.limit as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      {}
    );
    (firestore.setDoc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );
    vi.mocked(batchStore.clearPendingQuizCopy).mockResolvedValue(undefined);
    vi.mocked(syncedGroups.callJoinPlcQuizSyncGroup).mockResolvedValue({
      groupId: GROUP_ID,
      version: 4,
      alreadyJoined: false,
    });
    vi.mocked(syncedGroups.pullSyncedQuizContent).mockResolvedValue({
      title: 'Vocab Formative Check',
      questions: [
        { id: 'q1', type: 'multiple-choice', question: 'One?' },
        { id: 'q2', type: 'multiple-choice', question: 'Two?' },
      ],
      version: 6,
    } as unknown as Awaited<
      ReturnType<typeof syncedGroups.pullSyncedQuizContent>
    >);
  });

  it('builds the copy under the id the batch reserved', async () => {
    libraryHolds(null);
    const quizDrive = drive();
    const onCopyAdded = vi.fn();
    await reconcilePendingQuizCopies(
      UID,
      quizDrive,
      [pendingBatch()],
      onCopyAdded
    );

    expect(quizDrive.saveQuiz).toHaveBeenCalledWith(
      expect.objectContaining({ id: QUIZ_ID, title: 'Vocab Formative Check' })
    );
    const metadata = (firestore.setDoc as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][1] as unknown;
    expect(metadata).toMatchObject({
      id: QUIZ_ID,
      driveFileId: 'drive-file-1',
      questionCount: 2,
      // The higher of the join and the pull, so a peer's edit isn't re-pulled.
      sync: { groupId: GROUP_ID, lastSyncedVersion: 6 },
    });
    expect(batchStore.clearPendingQuizCopy).toHaveBeenCalledWith(
      UID,
      'batch-1',
      QUIZ_ID
    );
    expect(onCopyAdded).toHaveBeenCalledWith({
      title: 'Vocab Formative Check',
      requestedByName: 'Sarah Cole',
    });
  });

  it('binds to the copy they added themselves instead of making a second one', async () => {
    libraryHolds('their-own-quiz');
    const quizDrive = drive();
    await reconcilePendingQuizCopies(UID, quizDrive, [pendingBatch()]);

    expect(quizDrive.saveQuiz).not.toHaveBeenCalled();
    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(syncedGroups.callJoinPlcQuizSyncGroup).not.toHaveBeenCalled();
    expect(batchStore.clearPendingQuizCopy).toHaveBeenCalledWith(
      UID,
      'batch-1',
      'their-own-quiz'
    );
  });

  it('writes nothing local when the sync-group join fails, and keeps the marker', async () => {
    libraryHolds(null);
    vi.mocked(syncedGroups.callJoinPlcQuizSyncGroup).mockRejectedValue(
      new Error('not a member')
    );
    const quizDrive = drive();
    await reconcilePendingQuizCopies(UID, quizDrive, [pendingBatch()]);

    expect(quizDrive.saveQuiz).not.toHaveBeenCalled();
    expect(firestore.setDoc).not.toHaveBeenCalled();
    expect(batchStore.clearPendingQuizCopy).not.toHaveBeenCalled();
  });

  it('carries on to the next batch after one fails', async () => {
    libraryHolds(null);
    vi.mocked(syncedGroups.pullSyncedQuizContent)
      .mockRejectedValueOnce(new Error('group gone'))
      .mockResolvedValueOnce({
        title: 'Second quiz',
        questions: [{ id: 'q1', type: 'multiple-choice', question: 'One?' }],
        version: 2,
      } as unknown as Awaited<
        ReturnType<typeof syncedGroups.pullSyncedQuizContent>
      >);
    const quizDrive = drive();
    await reconcilePendingQuizCopies(UID, quizDrive, [
      pendingBatch(),
      pendingBatch({ id: 'batch-2', quizId: 'reserved-2' }),
    ]);

    expect(batchStore.clearPendingQuizCopy).toHaveBeenCalledTimes(1);
    expect(batchStore.clearPendingQuizCopy).toHaveBeenCalledWith(
      UID,
      'batch-2',
      'reserved-2'
    );
  });

  it('ignores a batch carrying no pending marker', async () => {
    const quizDrive = drive();
    await reconcilePendingQuizCopies(UID, quizDrive, [
      pendingBatch({ pendingQuizCopy: undefined }),
    ]);
    expect(firestore.getDocs).not.toHaveBeenCalled();
    expect(quizDrive.saveQuiz).not.toHaveBeenCalled();
  });
});
