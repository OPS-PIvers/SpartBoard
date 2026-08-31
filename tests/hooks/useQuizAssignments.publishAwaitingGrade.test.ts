/**
 * M12 3-G: publishAssignmentScores must NOT publish a score for a response
 * that is still owed a teacher grade. Before `GradeResult.state`, an ungraded
 * essay counted as 0 in the grading loop, so publishing froze a deflated
 * percentage the student saw as their real grade.
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
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import type { QuizData } from '@/types';

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
  auth: { currentUser: null },
}));

vi.mock('@/hooks/usePlcAssignmentIndex', () => ({
  writePlcAssignmentIndexEntry: vi.fn().mockResolvedValue(undefined),
  mirrorPlcAssignmentStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/usePlcAssignments', () => ({
  writePlcAssignmentTemplate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/plcContributions', () => ({
  deletePlcContribution: vi.fn().mockResolvedValue(undefined),
}));

const mockCollection = collection as Mock;
const mockDoc = doc as Mock;
const mockOnSnapshot = onSnapshot as Mock;
const mockWriteBatch = writeBatch as Mock;
const mockGetDocs = getDocs as Mock;

const TEACHER_UID = 'teacher-1';
const ASSIGNMENT_ID = 'assign-awaiting-1';

// One auto-graded MC (1 pt) plus one essay carrying a 2-criterion rubric (6 pts).
const quizData = {
  id: 'quiz-awaiting-1',
  title: 'Mixed Quiz',
  questions: [
    {
      id: 'q0',
      text: 'Q0',
      type: 'MC' as const,
      correctAnswer: 'a',
      incorrectAnswers: ['b'],
      timeLimit: 30,
      points: 1,
    },
    {
      id: 'e1',
      text: 'Explain',
      type: 'essay' as const,
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      points: 6,
      rubricSnapshot: {
        id: 'rub-1',
        title: 'Essay rubric',
        criteria: [
          {
            id: 'c1',
            name: 'Thesis',
            levels: [
              { id: 'c1-lo', label: 'Below', points: 0 },
              { id: 'c1-hi', label: 'Meets', points: 3 },
            ],
          },
          {
            id: 'c2',
            name: 'Evidence',
            levels: [
              { id: 'c2-lo', label: 'Below', points: 0 },
              { id: 'c2-hi', label: 'Meets', points: 3 },
            ],
          },
        ],
        createdAt: 0,
        updatedAt: 0,
      },
    },
  ],
  createdAt: 0,
  updatedAt: 0,
} satisfies QuizData;

describe('useQuizAssignments — publishAssignmentScores omits awaiting-grade scores', () => {
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockOnSnapshot.mockReturnValue(() => undefined);
    batchUpdate.mockReset();
    batchCommit.mockReset().mockResolvedValue(undefined);
    mockWriteBatch.mockReturnValue({
      update: batchUpdate,
      commit: batchCommit,
    });
    // Assignment doc read by publishAssignmentScores for `overridesByStudentUid`.
    (getDoc as Mock).mockResolvedValue({ data: () => ({}) });
  });

  async function publishOne(data: Record<string, unknown>) {
    const ref = { id: 'r-1' };
    mockGetDocs.mockResolvedValueOnce({ docs: [{ ref, data: () => data }] });
    const { result } = renderHook(() => useQuizAssignments(TEACHER_UID));
    await act(async () => {
      await result.current.publishAssignmentScores(
        ASSIGNMENT_ID,
        quizData,
        'score-only'
      );
    });
    const call = batchUpdate.mock.calls.find(([r]) => r === ref);
    if (!call) throw new Error('expected batch.update on the response ref');
    return call[1] as { score: unknown };
  }

  it('deletes the score when an answered essay has no teacher grade', async () => {
    const patch = await publishOne({
      studentUid: 's1',
      answers: [
        { questionId: 'q0', answer: 'a', answeredAt: 1 },
        { questionId: 'e1', answer: 'my essay', answeredAt: 2 },
      ],
    });
    // Without the fix this published `score: 14` (1 of 7 pts) — a real-looking
    // grade for work the teacher never read.
    expect(patch.score).toEqual({ __deleteFieldSentinel: true });
  });

  it('deletes the score when the rubric is only partially scored', async () => {
    const patch = await publishOne({
      studentUid: 's1',
      answers: [
        { questionId: 'q0', answer: 'a', answeredAt: 1 },
        { questionId: 'e1', answer: 'my essay', answeredAt: 2 },
      ],
      grading: {
        e1: {
          pointsAwarded: 3,
          rubricScores: [{ criterionId: 'c1', levelId: 'c1-hi', points: 3 }],
          gradedBy: TEACHER_UID,
          gradedAt: 1,
        },
      },
    });
    expect(patch.score).toEqual({ __deleteFieldSentinel: true });
  });

  it('publishes a real score once every rubric criterion is scored', async () => {
    const patch = await publishOne({
      studentUid: 's1',
      answers: [
        { questionId: 'q0', answer: 'a', answeredAt: 1 },
        { questionId: 'e1', answer: 'my essay', answeredAt: 2 },
      ],
      grading: {
        e1: {
          pointsAwarded: 6,
          rubricScores: [
            { criterionId: 'c1', levelId: 'c1-hi', points: 3 },
            { criterionId: 'c2', levelId: 'c2-hi', points: 3 },
          ],
          gradedBy: TEACHER_UID,
          gradedAt: 1,
        },
      },
    });
    // 1 (MC) + 6 (essay) of 7 → 100.
    expect(patch.score).toBe(100);
  });

  it('publishes a real score when the essay was left blank (a genuine 0)', async () => {
    const patch = await publishOne({
      studentUid: 's1',
      answers: [
        { questionId: 'q0', answer: 'a', answeredAt: 1 },
        { questionId: 'e1', answer: '', answeredAt: 2 },
      ],
    });
    // 1 of 7 → 14. A blank essay is not owed a grade.
    expect(patch.score).toBe(14);
  });
});
