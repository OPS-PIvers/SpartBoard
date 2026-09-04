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

let authUser: Record<string, unknown> | null = null;
const signInWithGoogle = vi.fn();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
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

vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: () => ({
    quizzes: [{ id: 'quiz-1', title: 'My Quiz', driveFileId: 'drive-1' }],
    loadQuizData: vi.fn(() => ({
      id: 'quiz-1',
      title: 'My Quiz',
      questions: [{ id: 'q1', type: 'MC', points: 10 }],
    })),
    loading: false,
  }),
}));
vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: () => ({ publishAssignmentScores: vi.fn() }),
}));
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
      responses: [{ studentUid: 'stu-1', status: 'completed', answers: [] }],
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
});
