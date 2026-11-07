import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { QuizConfig, QuizData, QuizResponse, QuizSession } from '@/types';

// Hook stubs mirror QuizResults.studentSortPoints.test.tsx.
const addToast = vi.fn();
const updateWidget = vi.fn();
const addWidget = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: [] },
    updateWidget,
    addWidget,
    addToast,
    rosters: [
      {
        id: 'r1',
        name: 'Period 1',
        students: [
          { id: 's1', firstName: 'Ada', lastName: 'Zeller', pin: '1111' },
          { id: 's2', firstName: 'Zoe', lastName: 'Abbott', pin: '2222' },
        ],
      },
    ],
  }),
}));
// The quiz final-score overlay reads Firestore; these tests don't cover it.
vi.mock('@/hooks/gradebook/useFinalScoreOverlay', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/hooks/gradebook/useFinalScoreOverlay')
  >()),
  useFinalScoreOverlay: () => null,
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: () => false,
    canAccessQuizMediaResponse: () => false,
    refreshGoogleToken: () => Promise.resolve(null),
    googleAccessToken: null,
    user: { uid: 'teacher-1' },
    orgId: null,
  }),
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

import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';

const quiz = {
  id: 'quiz-1',
  title: 'Sample Quiz',
  questions: ['q1', 'q2'].map((id) => ({
    id,
    type: 'MC',
    text: id,
    correctAnswer: 'a',
    incorrectAnswers: ['b'],
    timeLimit: 30,
    points: 2,
  })),
  createdAt: 1,
  updatedAt: 1,
} as unknown as QuizData;

function makeResponse(pin: string, answers: string[]): QuizResponse {
  return {
    studentUid: `uid-${pin}`,
    _responseKey: `pin-Period 1-${pin}`,
    pin,
    classPeriod: 'Period 1',
    answers: answers.map((answer, i) => ({
      questionId: `q${i + 1}`,
      answer,
      timestamp: 100,
    })),
    status: 'completed',
    submittedAt: 200,
    tabSwitchWarnings: 0,
  } as unknown as QuizResponse;
}

const session = {
  id: 'session-1',
  quizId: 'quiz-1',
  teacherUid: 'teacher-1',
  classIds: [],
  protection: {
    watermarkEnabled: false,
    tabWarningEnabled: false,
    tabWarningThreshold: 3,
  },
} as unknown as QuizSession;

const rowFor = (text: string) =>
  Array.from(document.querySelectorAll('[data-student-row]')).find((row) =>
    row.textContent?.includes(text)
  ) as HTMLElement;

const renderStudents = (
  responses: QuizResponse[],
  sessionOver: Partial<QuizSession> = {}
) => {
  render(
    <QuizResults
      quiz={quiz}
      responses={responses}
      config={
        { view: 'results', periodNames: ['Period 1'] } as unknown as QuizConfig
      }
      onBack={vi.fn()}
      session={{ ...session, ...sessionOver }}
      tabWarningsEnabled={false}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /students/i }));
};

describe('QuizResults — written answers on paper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('flags a submitted student whose paper sheet is not scanned yet', () => {
    const scanned = {
      ...makeResponse('1111', ['a', 'a']),
      paperWrittenBatchId: 'batch-1',
      paperWrittenSeat: 1,
    } as QuizResponse;
    const inProgress = {
      ...makeResponse('3333', ['a']),
      status: 'in-progress',
    } as QuizResponse;
    renderStudents([makeResponse('2222', ['a', 'b']), scanned, inProgress], {
      paperWrittenQuestionIds: ['q2'],
    });
    expect(
      within(rowFor('Abbott')).getByText('Paper not scanned')
    ).toBeInTheDocument();
    expect(
      within(rowFor('Zeller')).queryByText('Paper not scanned')
    ).not.toBeInTheDocument();
    expect(
      within(rowFor('3333')).queryByText('Paper not scanned')
    ).not.toBeInTheDocument();
  });

  it('shows nothing on a session without paper written answers', () => {
    renderStudents([makeResponse('2222', ['a', 'b'])]);
    expect(screen.queryByText('Paper not scanned')).not.toBeInTheDocument();
  });
});
