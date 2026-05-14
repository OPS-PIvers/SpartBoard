import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { QuizConfig, QuizData, QuizResponse } from '@/types';

// Same hook-stub pattern as the other QuizResults tests — minimum surface
// area to render the Results panel without spinning up Firestore.
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
    googleAccessToken: 'token-1',
    user: { uid: 'teacher-self' },
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

const mockPublish = vi.fn().mockResolvedValue(undefined);
vi.mock('@/utils/plcContributions', () => ({
  publishPlcContribution: (...args: unknown[]): Promise<void> => {
    return mockPublish(...args) as Promise<void>;
  },
}));

// Don't render the actual PlcTab — its onSnapshot subscription would
// connect to real Firestore in this test environment.
vi.mock('@/components/common/library/PlcTab', () => ({
  PlcTab: () => <div data-testid="plc-tab-stub" />,
}));

vi.mock('@/utils/quizDriveService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/quizDriveService')>();
  class MockQuizDriveService {
    exportResultsToSheet = vi.fn();
    createPlcSheetAndShare = vi.fn();
    regeneratePlcSheet = vi.fn();
  }
  return {
    ...actual,
    QuizDriveService: MockQuizDriveService,
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

function makeResponse(pin: string): QuizResponse {
  return {
    studentUid: `uid-${pin}`,
    pin,
    classPeriod: 'Period 1',
    answers: [{ questionId: 'q1', answer: 'a', timestamp: 100 }],
    status: 'completed',
    submittedAt: 200,
    tabSwitchWarnings: 0,
  } as unknown as QuizResponse;
}

function makeConfig(plcMode: boolean): QuizConfig {
  return {
    view: 'results',
    plcMode,
    teacherName: 'Teacher Self',
  } as unknown as QuizConfig;
}

describe('QuizResults — auto-publish PLC contribution', () => {
  beforeEach(() => {
    mockPublish.mockClear().mockResolvedValue(undefined);
    addToast.mockClear();
    vi.useFakeTimers();
  });

  it('publishes the contribution after the debounce window when plcId is set and responses are present', async () => {
    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[makeResponse('1111')]}
        config={makeConfig(true)}
        onBack={vi.fn()}
        plcId="plc-test"
        syncGroupId="sync-group-X"
      />
    );

    // Before the debounce settles, no publish.
    expect(mockPublish).not.toHaveBeenCalled();

    // Advance past the 1.5s debounce — the effect's setTimeout fires
    // and queues the publish microtask. `advanceTimersByTimeAsync` flushes
    // both fake timer callbacks and any awaited microtasks they trigger.
    await vi.advanceTimersByTimeAsync(1600);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const callArgs = mockPublish.mock.calls[0][0] as {
      plcId: string;
      teacherUid: string;
      teacherName: string;
      syncGroupId: string | null;
      responses: unknown[];
    };
    expect(callArgs.plcId).toBe('plc-test');
    expect(callArgs.teacherUid).toBe('teacher-self');
    expect(callArgs.teacherName).toBe('Teacher Self');
    expect(callArgs.syncGroupId).toBe('sync-group-X');
    expect(callArgs.responses).toHaveLength(1);
  });

  it('does not publish when plcId is null (no PLC linkage)', async () => {
    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[makeResponse('1111')]}
        config={makeConfig(false)}
        onBack={vi.fn()}
        plcId={null}
      />
    );

    await vi.advanceTimersByTimeAsync(2000);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('does not publish when the responses array is empty', async () => {
    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[]}
        config={makeConfig(true)}
        onBack={vi.fn()}
        plcId="plc-test"
      />
    );

    await vi.advanceTimersByTimeAsync(2000);
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
