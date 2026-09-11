/**
 * PR 1 of docs/plans/PLC_ASSESSMENT_DATA.md: a PLC-linked assignment stamps
 * the SESSION doc with `plcId` / `syncGroupId` / `plcLinkedAt` so the server
 * can pool results without reading the teacher's private assignment doc.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import {
  useQuizAssignments,
  type AssignmentQuizRef,
} from '@/hooks/useQuizAssignments';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteField: vi.fn(() => ({ __deleteFieldSentinel: true })),
  doc: vi.fn(),
  documentId: vi.fn(() => '__documentId'),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  query: vi.fn(),
  startAfter: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  Timestamp: { fromMillis: vi.fn((ms: number) => ({ __ts: ms })) },
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('@/hooks/useSyncedQuizGroups', () => ({
  callJoinSyncedQuizGroup: vi.fn(),
  callLeaveSyncedQuizGroup: vi.fn(),
  createSyncedQuizGroup: vi.fn(),
  pullSyncedQuizContent: vi.fn(),
  publishSyncedQuiz: vi.fn(),
  useSyncedQuizGroupsByIds: vi.fn(() => ({
    groups: new Map(),
    loading: false,
  })),
  SyncedQuizVersionConflictError: class extends Error {},
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: { displayName: 'Alice', email: 'alice@example.com' } },
}));

vi.mock('@/hooks/usePlcAssignmentIndex', () => ({
  writePlcAssignmentIndexEntry: vi.fn().mockResolvedValue(undefined),
  mirrorPlcAssignmentStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/usePlcAssignments', () => ({
  writePlcAssignmentTemplate: vi.fn().mockResolvedValue(undefined),
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockWriteBatch = writeBatch as Mock;
const mockGetDocs = getDocs as Mock;

const TEACHER_UID = 'teacher-1';

const QUIZ = {
  id: 'quiz-1',
  title: 'Fractions Quick Check',
  driveFileId: 'drive-1',
  questions: [],
};

const PLC = {
  id: 'plc-42',
  name: 'Math PLC',
  memberEmails: ['a@x.com', 'b@x.com'],
};

describe('useQuizAssignments — createAssignment PLC session linkage', () => {
  const batchSet = vi.fn();
  const batchCommit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockReturnValue('coll-ref');
    mockOnSnapshot.mockReturnValue(() => undefined);
    // allocateJoinCode collision probe — empty means the first code wins.
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    (getDoc as Mock).mockResolvedValue({ data: () => ({}) });
    batchSet.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      set: batchSet,
      update: vi.fn(),
      commit: batchCommit,
    });
  });

  function findSessionSet(): Record<string, unknown> {
    const call = batchSet.mock.calls.find(
      ([ref]) => typeof ref === 'string' && ref.startsWith('quiz_sessions/')
    );
    if (!call) throw new Error('session doc was not written');
    return call[1] as Record<string, unknown>;
  }

  function findAssignmentSet(): Record<string, unknown> {
    const call = batchSet.mock.calls.find(
      ([ref]) =>
        typeof ref === 'string' &&
        ref.startsWith(`users/${TEACHER_UID}/quiz_assignments/`)
    );
    if (!call) throw new Error('assignment doc was not written');
    return call[1] as Record<string, unknown>;
  }

  it('stamps plcId, the synced-group id and plcLinkedAt on the session doc', async () => {
    const before = Date.now();
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.createAssignment(
        QUIZ,
        { sessionMode: 'teacher', sessionOptions: {}, plc: PLC },
        { plcTemplateSyncGroupId: 'sync-group-abc' }
      );
    });
    const session = findSessionSet();
    expect(session.plcId).toBe('plc-42');
    expect(session.syncGroupId).toBe('sync-group-abc');
    expect(typeof session.plcLinkedAt).toBe('number');
    expect(session.plcLinkedAt as number).toBeGreaterThanOrEqual(before);
  });

  it('pools by plcPoolSyncGroupId ahead of the template group id', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.createAssignment(
        QUIZ,
        { sessionMode: 'teacher', sessionOptions: {}, plc: PLC },
        {
          plcTemplateSyncGroupId: 'sync-group-abc',
          plcPoolSyncGroupId: 'library-group-xyz',
        }
      );
    });
    expect(findSessionSet().syncGroupId).toBe('library-group-xyz');
  });

  it('prefers a syncedFrom group id when no template group id is given', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.createAssignment(
        QUIZ,
        { sessionMode: 'teacher', sessionOptions: {}, plc: PLC },
        { syncedFrom: { groupId: 'synced-from-xyz', syncedVersion: 3 } }
      );
    });
    expect(findSessionSet().syncGroupId).toBe('synced-from-xyz');
  });

  it('falls back to the quiz id as syncGroupId for an un-synced quiz', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.createAssignment(QUIZ, {
        sessionMode: 'teacher',
        sessionOptions: {},
        plc: PLC,
      });
    });
    const session = findSessionSet();
    expect(session.plcId).toBe('plc-42');
    expect(session.syncGroupId).toBe('quiz-1');
  });

  it('writes none of the PLC fields for a non-PLC assignment', async () => {
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.createAssignment(
        QUIZ,
        { sessionMode: 'teacher', sessionOptions: {} },
        { plcTemplateSyncGroupId: 'sync-group-abc' }
      );
    });
    const session = findSessionSet();
    expect(session).not.toHaveProperty('plcId');
    expect(session).not.toHaveProperty('syncGroupId');
    expect(session).not.toHaveProperty('plcLinkedAt');
  });

  it('stores a compact teacher-private target snapshot on the assignment', async () => {
    const taggedQuiz = {
      ...QUIZ,
      questions: [
        {
          id: 'q1',
          type: 'MC',
          timeLimit: 0,
          text: 'Which source is primary?',
          correctAnswer: 'A diary',
          incorrectAnswers: ['A textbook'],
          points: 1,
          targets: [
            {
              id: 'target-sources',
              kind: 'plc',
              ownerId: 'plc-42',
              label: 'Evaluate sources',
            },
          ],
        },
      ],
    } satisfies AssignmentQuizRef;
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.createAssignment(taggedQuiz, {
        sessionMode: 'teacher',
        sessionOptions: { showLearningTargets: false },
        plc: PLC,
      });
    });
    expect(findAssignmentSet().questionSnapshot).toEqual([
      {
        id: 'q1',
        targets: [
          {
            id: 'target-sources',
            kind: 'plc',
            ownerId: 'plc-42',
            label: 'Evaluate sources',
          },
        ],
      },
    ]);
    expect(findSessionSet().publicQuestions).toEqual([
      expect.not.objectContaining({ targets: expect.anything() }),
    ]);
  });
});
