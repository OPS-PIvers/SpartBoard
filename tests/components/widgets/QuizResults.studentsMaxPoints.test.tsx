import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { QuizConfig, QuizData, QuizResponse, QuizSession } from '@/types';

// Hook stub set mirrors QuizResults.unlock.test.tsx — only the surface
// QuizResults reaches during render + Students-tab interaction.
const addToast = vi.fn();
const updateWidget = vi.fn();
const addWidget = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: [] },
    updateWidget,
    addWidget,
    addToast,
    rosters: [],
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
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

// A Drive-sync/arrayUnion race can write the same question id twice into
// `quiz.questions` (see utils/quizMaxPoints.ts) — the Students tab's
// denominator must dedupe the same way the gradebook denominator does.
function makeQuizWithDuplicateQuestion(): QuizData {
  const q1 = {
    id: 'q1',
    type: 'MC',
    text: 'Q1',
    correctAnswer: 'a',
    incorrectAnswers: ['b'],
    timeLimit: 30,
    points: 1,
  };
  return {
    id: 'quiz-1',
    title: 'Sample Quiz',
    questions: [q1, { ...q1 }],
    createdAt: 1,
    updatedAt: 1,
  } as unknown as QuizData;
}

function makeCorrectResponse(): QuizResponse {
  return {
    studentUid: 'uid-1111',
    _responseKey: 'pin-Period 1-1111',
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

function makeSession(): QuizSession {
  return {
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
}

describe('QuizResults — Students tab points denominator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dedupes a Drive-sync duplicate question id so a fully-correct student shows 1/1, not 1/2', async () => {
    render(
      <QuizResults
        quiz={makeQuizWithDuplicateQuestion()}
        responses={[makeCorrectResponse()]}
        config={makeConfig()}
        onBack={vi.fn()}
        session={makeSession()}
        tabWarningsEnabled={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /students/i }));

    expect(await screen.findByText('1/1 pts')).toBeInTheDocument();
    expect(screen.queryByText('1/2 pts')).not.toBeInTheDocument();
  });
});
