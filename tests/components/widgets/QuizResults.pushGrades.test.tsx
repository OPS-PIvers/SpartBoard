import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { QuizConfig, QuizData, QuizResponse, QuizSession } from '@/types';

// Hook-stub set mirrors the other QuizResults tests — only the surface the
// Results panel touches during render + the Push-grades header action.
const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: [] },
    updateWidget: vi.fn(),
    addWidget: vi.fn(),
    addToast,
    rosters: [],
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    googleAccessToken: null,
    user: { uid: 'teacher-1', email: 'teacher@orono.k12.mn.us' },
    orgId: null,
    // The grade-push button is additionally gated on the admin-managed
    // `google-classroom` feature doc; default-allow in this suite.
    canAccessFeature: () => true,
  }),
}));
// Auto-confirm the "Push grades?" dialog so the handler proceeds.
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({
    plcs: [],
    clearPlcSharedSheetUrl: vi.fn(),
    setPlcSharedSheetUrl: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({
    byStudentUid: new Map(),
    byAssignmentPseudonym: new Map(),
  }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useClickOutside', () => ({ useClickOutside: vi.fn() }));
vi.mock('@/utils/quizDriveService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/quizDriveService')>();
  class MockQuizDriveService {
    exportResultsToSheet = vi.fn();
    createPlcSheetAndShare = vi.fn();
    regeneratePlcSheet = vi.fn();
  }
  return { ...actual, QuizDriveService: MockQuizDriveService };
});

// The two seams under test: the GIS token popup and the CF callable wrapper.
const mockToken = vi.fn();
vi.mock('@/components/classroomAddon/gisOAuth', () => ({
  requestClassroomTeacherToken: (...args: unknown[]): Promise<string> =>
    mockToken(...args) as Promise<string>,
}));
const mockPush = vi.fn();
vi.mock('@/utils/classroomGradePush', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/classroomGradePush')>();
  return {
    ...actual,
    pushClassroomGradesForAssignment: (...args: unknown[]): Promise<unknown> =>
      mockPush(...args) as Promise<unknown>,
  };
});

import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';

function makeQuiz(): QuizData {
  return {
    id: 'quiz-1',
    title: 'Sample Quiz',
    questions: [
      {
        id: 'q1',
        type: 'MC',
        text: 'Q1',
        correctAnswer: 'a',
        incorrectAnswers: ['b'],
        timeLimit: 30,
        points: 1,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeResponse(): QuizResponse {
  return {
    studentUid: 'pseudo-A',
    pin: '1111',
    classPeriod: 'Period 1',
    answers: [{ questionId: 'q1', answer: 'a', timestamp: 100 }],
    status: 'completed',
    submittedAt: 200,
    tabSwitchWarnings: 0,
  } as unknown as QuizResponse;
}

function makeConfig(): QuizConfig {
  return { view: 'results', teacherName: 'Teacher A' } as unknown as QuizConfig;
}

// A session attached to a Classroom coursework item — this is what makes the
// "PUSH GRADES" header action render.
function makeSession(): QuizSession {
  return {
    id: 'session-1',
    quizId: 'quiz-1',
    teacherUid: 'teacher-1',
    classIds: [],
    classroomAttachment: {
      courseId: 'C1',
      itemId: 'I1',
      attachmentId: 'ATT1',
      maxPoints: 20,
    },
  } as unknown as QuizSession;
}

describe('QuizResults — Push grades to Google Classroom (live add-on token)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mints a fresh add-on token and forwards it to the CF, then shows a success toast', async () => {
    mockToken.mockResolvedValue('live-token');
    mockPush.mockResolvedValue({
      results: [],
      pushed: 1,
      skipped: 0,
      failed: 0,
    });

    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[makeResponse()]}
        config={makeConfig()}
        onBack={vi.fn()}
        session={makeSession()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /push grades/i }));

    // The token popup is invoked with the teacher's email as the login hint.
    await waitFor(() => expect(mockToken).toHaveBeenCalledTimes(1));
    expect(mockToken).toHaveBeenCalledWith('teacher@orono.k12.mn.us');

    // The CF receives the freshly minted token alongside the ids + grades.
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const args = mockPush.mock.calls[0][1] as {
      courseId: string;
      itemId: string;
      attachmentId: string;
      accessToken: string;
      grades: Array<{ pseudonymUid: string; pointsEarned: number }>;
    };
    expect(args.courseId).toBe('C1');
    expect(args.itemId).toBe('I1');
    expect(args.attachmentId).toBe('ATT1');
    expect(args.accessToken).toBe('live-token');
    expect(args.grades).toHaveLength(1);
    expect(args.grades[0].pseudonymUid).toBe('pseudo-A');

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.stringMatching(/Pushed 1 grade/i),
        'success'
      )
    );
  });

  it('does NOT call the CF and surfaces a cancel toast when the consent popup is dismissed', async () => {
    mockToken.mockRejectedValue(new Error('OAuth popup failed: popup_closed'));

    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[makeResponse()]}
        config={makeConfig()}
        onBack={vi.fn()}
        session={makeSession()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /push grades/i }));

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.stringMatching(/cancelled.*no grades/i),
        'error'
      )
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
