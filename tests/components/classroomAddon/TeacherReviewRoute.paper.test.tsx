import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Classroom add-on grading of handwritten paper answers (plan 4C: D33, D37).

const updateDoc = vi.fn((..._args: unknown[]) => Promise.resolve());
const doc = vi.fn((..._path: unknown[]) => ({ path: _path.slice(1) }));
vi.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
  auth: { currentUser: { uid: 'teacher-1' } },
  isAuthBypass: false,
}));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: (...args: unknown[]) => doc(...args),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => undefined),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
}));
vi.mock('@/utils/quizJoinCodes', () => ({
  findQuizSessionsByCode: vi.fn(() =>
    Promise.resolve([{ id: 'sess-1', data: {} }])
  ),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: {
      uid: 'teacher-1',
      email: 't@example.com',
      providerData: [{ providerId: 'google.com' }],
    },
    signInWithGoogle: vi.fn(),
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
    loadQuizData: vi.fn(() =>
      Promise.resolve({
        id: 'quiz-1',
        title: 'My Quiz',
        questions: [
          { id: 'q1', type: 'free-response', points: 4, correctAnswer: '' },
        ],
      })
    ),
    loading: false,
  }),
}));

const publishAssignmentScores = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ responsesUpdated: 1, paperResponses: 1 })
);
let assignments: Record<string, unknown>[] = [];
vi.mock('@/hooks/useQuizAssignments', async (importOriginal) => ({
  countPendingPaperTranscripts: (
    await importOriginal<typeof import('@/hooks/useQuizAssignments')>()
  ).countPendingPaperTranscripts,
  useQuizAssignments: () => ({ assignments, publishAssignmentScores }),
}));

let sessionOverrides: Record<string, unknown> = {};
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
        ...sessionOverrides,
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
    useAssignmentPseudonymsMulti: () => ({
      byStudentUid: new Map([
        ['stu-1', { givenName: 'Sam', familyName: 'Lee' }],
      ]),
    }),
  };
});
vi.mock('@/hooks/useLtiSessionNames', () => ({
  useLtiSessionNames: () => new Map(),
}));

const graderProps = vi.fn();
vi.mock(
  '@/components/widgets/QuizWidget/components/FreeResponseGrader',
  () => ({
    FreeResponseGrader: (props: Record<string, unknown>) => {
      graderProps(props);
      return <div>grader</div>;
    },
  })
);

const paperResponse = {
  studentUid: 'stu-1',
  status: 'completed',
  answers: [
    {
      questionId: 'q1',
      answer: 'The water cycle',
      paperTranscript: 'done',
      artifacts: [{ id: 'h1', kind: 'handwriting', slot: 'handwriting' }],
    },
  ],
};
const typedResponse = {
  studentUid: 'stu-1',
  status: 'completed',
  answers: [{ questionId: 'q1', answer: 'The water cycle' }],
};

const renderRoute = async () => {
  const { ClassroomAddonTeacherReview } =
    await import('@/components/classroomAddon/TeacherReviewRoute');
  render(<ClassroomAddonTeacherReview kind="quiz" code="ABC123" />);
  await screen.findByText('Sam Lee');
};

const pickOption = async (trigger: string, option: string) => {
  fireEvent.click(await screen.findByRole('button', { name: trigger }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
};

describe('ClassroomAddonTeacherReview with paper written answers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionOverrides = {};
    assignments = [];
    window.history.replaceState({}, '', '/classroom-addon/teacher');
  });

  it('badges paper responses, and mounts the grader with the crop wiring', async () => {
    responses = [paperResponse];
    await renderRoute();
    expect(screen.getByText('Paper')).toBeTruthy();

    const gradeButton = screen
      .getByText('Grade Free Response')
      .closest('button') as HTMLButtonElement;
    await waitFor(() => expect(gradeButton.disabled).toBe(false));
    fireEvent.click(gradeButton);
    await screen.findByText('grader');
    const props = graderProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(props.sessionId).toBe('sess-1');
    expect(typeof props.resolvePaperCrop).toBe('function');
    expect(props.paperPrivate).toBeInstanceOf(Map);
    expect(props.paperActions).toEqual(
      expect.objectContaining({
        updateTranscript: expect.any(Function),
        applyNewerScan: expect.any(Function),
        transcribeBlank: expect.any(Function),
        retry: expect.any(Function),
      })
    );
  });

  it('publishes with the chosen return mode', async () => {
    responses = [paperResponse];
    await renderRoute();
    await pickOption('Written answers', 'Both');

    const publish = screen
      .getByText('Publish scores')
      .closest('button') as HTMLButtonElement;
    await waitFor(() => expect(publish.disabled).toBe(false));
    fireEvent.click(publish);

    await waitFor(() =>
      expect(publishAssignmentScores).toHaveBeenCalledWith(
        'sess-1',
        expect.objectContaining({ id: 'quiz-1' }),
        'score-and-responses',
        undefined,
        'both'
      )
    );
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('warns when transcripts are still pending', async () => {
    responses = [
      {
        ...paperResponse,
        answers: [
          {
            ...paperResponse.answers[0],
            answer: '',
            paperTranscript: 'pending',
          },
        ],
      },
    ];
    await renderRoute();
    expect(
      screen.getByText(
        '1 answer still transcribing. It publishes as awaiting grade.'
      )
    ).toBeTruthy();
  });

  it('starts from the published mode and shows the picker from the assignment flag', async () => {
    responses = [typedResponse];
    assignments = [{ id: 'sess-1', hasPaperWritten: true }];
    sessionOverrides = { writtenReturnMode: 'typed' };
    await renderRoute();
    expect(
      screen.getByRole('button', { name: 'Written answers' }).textContent
    ).toContain('Typed');
  });

  it('behaves as before for typed-only assignments', async () => {
    responses = [typedResponse];
    await renderRoute();
    expect(screen.queryByText('Paper')).toBeNull();
    expect(screen.queryByText('Written answers')).toBeNull();

    const publish = screen
      .getByText('Publish scores')
      .closest('button') as HTMLButtonElement;
    await waitFor(() => expect(publish.disabled).toBe(false));
    fireEvent.click(publish);
    await waitFor(() =>
      expect(publishAssignmentScores).toHaveBeenCalledTimes(1)
    );
    expect(publishAssignmentScores.mock.calls[0][4]).toBeUndefined();
  });
});
