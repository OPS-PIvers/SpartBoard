import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { QuizConfig, QuizData, QuizResponse, QuizSession } from '@/types';

// Hook stubs mirror QuizResults.studentsMaxPoints.test.tsx.
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

const renderStudents = () => {
  render(
    <QuizResults
      quiz={quiz}
      // Ada Zeller scores higher, so score order and last-name order differ.
      responses={[
        makeResponse('2222', ['a', 'b']),
        makeResponse('1111', ['a', 'a']),
      ]}
      config={
        { view: 'results', periodNames: ['Period 1'] } as unknown as QuizConfig
      }
      onBack={vi.fn()}
      session={session}
      tabWarningsEnabled={false}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /students/i }));
};

const rowNames = () =>
  Array.from(document.querySelectorAll('[data-student-row]')).map(
    (row) => within(row as HTMLElement).getAllByRole('button')[0].textContent
  );

describe('QuizResults — Students sort and score display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('sorts by score by default and by last name on request', () => {
    renderStudents();
    expect(rowNames()).toEqual(['Ada Zeller', 'Zoe Abbott']);
    fireEvent.click(screen.getByRole('button', { name: 'Last name' }));
    expect(rowNames()).toEqual(['Zoe Abbott', 'Ada Zeller']);
  });

  it('keeps score order and drops the name sort while names are hidden', () => {
    localStorage.setItem('spartboard.quizResults.hideNames.teacher-1', '1');
    localStorage.setItem(
      'spartboard.quizResults.studentView.teacher-1',
      'lastName|percent'
    );
    renderStudents();
    expect(screen.queryByRole('button', { name: 'Last name' })).toBeNull();
    const rows = Array.from(document.querySelectorAll('[data-student-row]'));
    expect(rows[0].textContent).not.toContain('Zeller');
    expect(rows[0].textContent).toContain('100%');
    expect(rows[1].textContent).toContain('50%');
  });

  it('shows points in place of percentages and remembers the choice', () => {
    renderStudents();
    expect(screen.getByText('50%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Points' }));
    expect(screen.getByText('2/4')).toBeInTheDocument();
    expect(screen.queryByText('2/4 pts')).toBeNull();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(
      localStorage.getItem('spartboard.quizResults.studentView.teacher-1')
    ).toBe('score|points');
  });
});
