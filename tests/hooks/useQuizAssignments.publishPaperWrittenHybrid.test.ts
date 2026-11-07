/** paper-written-hybrid: an unscanned paper answer holds the published score. */
import { describe, it, expect, vi } from 'vitest';
import {
  buildResponseGradingContext,
  gradeResponseForPublish,
} from '@/hooks/useQuizAssignments';
import type { QuizData, QuizResponse } from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteField: vi.fn(),
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
  runTransaction: vi.fn(),
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

const authMock: {
  currentUser: { displayName?: string; email?: string } | null;
} = {
  currentUser: null,
};
vi.mock('@/config/firebase', () => ({
  db: {},
  get auth() {
    return authMock;
  },
}));

vi.mock('@/hooks/usePlcAssignmentIndex', () => ({
  writePlcAssignmentIndexEntry: vi.fn().mockResolvedValue(undefined),
  mirrorPlcAssignmentStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/usePlcAssignments', () => ({
  writePlcAssignmentTemplate: vi.fn().mockResolvedValue(undefined),
}));

const quizData = {
  id: 'quiz-1',
  title: 'Test Quiz',
  questions: [
    {
      id: 'q0',
      text: 'Q0',
      type: 'MC' as const,
      correctAnswer: 'a',
      incorrectAnswers: ['b', 'c', 'd'],
      timeLimit: 30,
      points: 1,
    },
    {
      id: 'q1',
      text: 'Q1',
      type: 'free-response' as const,
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 30,
      points: 2,
    },
  ],
  createdAt: 0,
  updatedAt: 0,
} satisfies QuizData;

const grade = (
  answers: { questionId: string; answer: string; paperTranscript?: string }[],
  extra: Record<string, unknown> = {}
) =>
  gradeResponseForPublish(
    {
      studentUid: 's1',
      status: 'completed',
      answers: answers.map((a) => ({ ...a, answeredAt: 1 })),
      ...extra,
    } as unknown as QuizResponse,
    buildResponseGradingContext(quizData, { paperWrittenQuestionIds: ['q1'] })
  );

describe('gradeResponseForPublish: written answers on paper', () => {
  it('publishes no score before the paper answer is scanned', () => {
    expect(grade([{ questionId: 'q0', answer: 'a' }]).score).toBeNull();
  });

  it('publishes a score once the scanned box is graded', () => {
    expect(
      grade(
        [
          { questionId: 'q0', answer: 'a' },
          { questionId: 'q1', answer: 'Gravity', paperTranscript: 'done' },
        ],
        {
          grading: { q1: { pointsAwarded: 1, gradedBy: 't', gradedAt: 1 } },
        }
      ).score
    ).toBe(67);
  });

  it('treats a scanned blank box as a 0', () => {
    expect(
      grade([
        { questionId: 'q0', answer: 'a' },
        { questionId: 'q1', answer: '', paperTranscript: 'blank' },
      ]).score
    ).toBe(33);
  });

  it('scores a quiz without paper answers as before', () => {
    expect(
      gradeResponseForPublish(
        {
          studentUid: 's1',
          status: 'completed',
          answers: [{ questionId: 'q0', answer: 'a', answeredAt: 1 }],
        } as unknown as QuizResponse,
        buildResponseGradingContext(quizData, {})
      ).score
    ).toBe(33);
  });
});
