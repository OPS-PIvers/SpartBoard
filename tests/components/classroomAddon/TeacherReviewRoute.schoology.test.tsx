import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Schoology-platform review: Google-session gate, NRPS names, AGS grade push.

const pushCallable = vi.fn(() => ({
  data: {
    results: [{ pseudonymUid: 'stu-1', ok: true }],
    pushed: 1,
    total: 1,
  },
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
  auth: { currentUser: { uid: 'teacher-1' } },
  isAuthBypass: false,
}));
vi.mock('firebase/functions', () => ({ httpsCallable: () => pushCallable }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  updateDoc: vi.fn(() => undefined),
  getDocs: vi.fn(() => ({ empty: false, docs: [{ id: 'sess-1' }] })),
}));
// The route resolves its session id through the join-code lookup; this test is
// about what happens after that, so the lookup is stubbed to the same session.
vi.mock('@/utils/quizJoinCodes', () => ({
  findQuizSessionsByCode: vi.fn(() =>
    Promise.resolve([{ id: 'sess-1', data: {} }])
  ),
  addJoinCodePointerToBatch: vi.fn(),
  deleteJoinCodePointerFromBatch: vi.fn(),
}));

let authUser: Record<string, unknown> | null = null;
const signInWithGoogle = vi.fn();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: () => false,
    user: authUser,
    signInWithGoogle,
    googleAccessToken: 'drive-token',
    refreshGoogleToken: vi.fn(),
    orgId: null,
    canAccessQuizMediaResponse: () => false,
    quizGraderMode: 'by-student',
    quizGraderAutoAdvance: false,
    updateAccountPreferences: vi.fn(),
  }),
}));

const plainQuiz = {
  id: 'quiz-1',
  title: 'My Quiz',
  questions: [{ id: 'q1', type: 'MC', points: 10 }],
};
let driveFiles: Record<string, unknown> = {};
const loadQuizData = vi.fn(
  (id: string) => driveFiles[id] ?? Promise.reject(new Error(id))
);
vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: () => ({
    quizzes: [{ id: 'quiz-1', title: 'My Quiz', driveFileId: 'drive-1' }],
    loadQuizData,
    loading: false,
  }),
}));
let assignments: Record<string, unknown>[] = [];
vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: () => ({
    assignments,
    loading: false,
    publishAssignmentScores: vi.fn(),
  }),
  countPendingPaperTranscripts: () => 0,
}));
let bankFiles: Record<string, unknown> = {};
const loadBankData = vi.fn(
  (id: string) => bankFiles[id] ?? Promise.reject(new Error(id))
);
vi.mock('@/hooks/useQuestionBanks', () => ({
  useQuestionBanks: () => ({
    banks: [{ id: 'bank-1', driveFileId: 'bank-drive-1' }],
    loading: false,
    loadBankData,
  }),
}));
let responses: Record<string, unknown>[] = [];
vi.mock('@/hooks/useQuizSession', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/useQuizSession')>();
  return {
    ...actual,
    useQuizSessionTeacher: () => ({
      session: {
        id: 'sess-1',
        quizId: 'quiz-1',
        quizTitle: 'My Quiz',
        code: 'ABC123',
        teacherUid: 'teacher-1',
        ltiNrps: true,
        ltiAttachment: { resourceLinkId: 'rl-1' },
      },
      responses,
      loading: false,
    }),
  };
});
vi.mock('@/hooks/useAssignmentPseudonyms', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/useAssignmentPseudonyms')>();
  return {
    ...actual,
    useAssignmentPseudonymsMulti: () => ({ byStudentUid: new Map() }),
  };
});
const ltiNames = vi.fn(
  (_sessionId: string | null, _enabled: boolean) =>
    new Map([['stu-1', { givenName: 'Sam', familyName: 'Lee' }]])
);
vi.mock('@/hooks/useLtiSessionNames', () => ({
  useLtiSessionNames: (sessionId: string | null, enabled: boolean) =>
    ltiNames(sessionId, enabled),
}));

const googleUser = {
  uid: 'teacher-1',
  email: 't@example.com',
  providerData: [{ providerId: 'google.com' }],
};

describe('ClassroomAddonTeacherReview on Schoology', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    driveFiles = { 'drive-1': plainQuiz };
    bankFiles = {};
    assignments = [];
    responses = [{ studentUid: 'stu-1', status: 'completed', answers: [] }];
    window.history.replaceState({}, '', '/lti/teacher?lc=x');
  });

  it('gates a studentRole custom-token session behind Google sign-in', async () => {
    authUser = { uid: 'schoology-sub-1', providerData: [] };
    const { ClassroomAddonTeacherReview } =
      await import('@/components/classroomAddon/TeacherReviewRoute');
    render(
      <ClassroomAddonTeacherReview
        kind="quiz"
        code="ABC123"
        platform="schoology"
      />
    );
    expect(screen.getByText('Sign in to SpartBoard')).toBeTruthy();
    expect(screen.queryByText('Responses')).toBeNull();
  });

  it('names Schoology students via NRPS and pushes grades over AGS', async () => {
    authUser = googleUser;
    const { ClassroomAddonTeacherReview } =
      await import('@/components/classroomAddon/TeacherReviewRoute');
    render(
      <ClassroomAddonTeacherReview
        kind="quiz"
        code="ABC123"
        platform="schoology"
      />
    );
    expect(await screen.findByText(/Sam/)).toBeTruthy();
    expect(ltiNames).toHaveBeenCalledWith('sess-1', true);
    expect(screen.queryByText('Push grades to Classroom')).toBeNull();

    const button = await screen.findByText('Push grades to Schoology');
    await waitFor(() =>
      expect((button.closest('button') as HTMLButtonElement).disabled).toBe(
        false
      )
    );
    fireEvent.click(button);
    await waitFor(() => expect(pushCallable).toHaveBeenCalledTimes(1));
    expect(pushCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-1',
        kind: 'quiz',
        maxPoints: 10,
        grades: [{ pseudonymUid: 'stu-1', pointsEarned: 0 }],
      })
    );
    expect(await screen.findByText(/Pushed 1 grade to Schoology/)).toBeTruthy();
  });

  it('grades a bank draw with the bank’s current answer key', async () => {
    authUser = googleUser;
    const fib = {
      id: 'q1',
      type: 'FIB',
      text: 'Studies of identical twins are called ____.',
      timeLimit: 0,
      points: 10,
      correctAnswer: 'Twin studies',
      incorrectAnswers: [],
    };
    driveFiles = {
      'drive-1': {
        id: 'quiz-1',
        title: 'My Quiz',
        questions: [],
        bankSlots: [
          { id: 's1', bankId: 'bank-1', bankTitle: 'B', mode: 'random' },
        ],
      },
      'frozen-1': { id: 'quiz-1', title: 'My Quiz', questions: [fib] },
    };
    bankFiles = {
      'bank-drive-1': {
        id: 'bank-1',
        title: 'B',
        questions: [{ ...fib, points: 1, alternateAnswers: ['Twins studies'] }],
      },
    };
    assignments = [{ id: 'sess-1', resolvedDriveFileId: 'frozen-1' }];
    responses = [
      {
        studentUid: 'stu-1',
        status: 'completed',
        answers: [{ questionId: 'q1', answer: 'Twins studies' }],
      },
    ];
    const { ClassroomAddonTeacherReview } =
      await import('@/components/classroomAddon/TeacherReviewRoute');
    render(
      <ClassroomAddonTeacherReview
        kind="quiz"
        code="ABC123"
        platform="schoology"
      />
    );
    const button = await screen.findByText('Push grades to Schoology');
    await waitFor(() =>
      expect((button.closest('button') as HTMLButtonElement).disabled).toBe(
        false
      )
    );
    fireEvent.click(button);
    await waitFor(() => expect(pushCallable).toHaveBeenCalledTimes(1));
    expect(pushCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        maxPoints: 10,
        grades: [{ pseudonymUid: 'stu-1', pointsEarned: 10 }],
      })
    );
  });
});
