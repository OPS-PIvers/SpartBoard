import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuizConfig, QuizData, QuizResponse, QuizSession } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: [] },
    updateWidget: vi.fn(),
    addWidget: vi.fn(),
    addToast: vi.fn(),
    rosters: [],
  }),
}));
const features = vi.hoisted(() => new Set<string>());
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessQuizMediaResponse: () => false,
    refreshGoogleToken: () => Promise.resolve(null),
    googleAccessToken: null,
    ensureGoogleScope: vi.fn(),
    user: { uid: 'teacher-1' },
    orgId: null,
    isExternalUser: false,
    canAccessFeature: (id: string) => features.has(id),
    updateAccountPreferences: vi.fn().mockResolvedValue(undefined),
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

const graderProps: Record<string, unknown>[] = [];
vi.mock(
  '@/components/widgets/QuizWidget/components/FreeResponseGrader',
  () => ({
    FreeResponseGrader: (props: Record<string, unknown>) => {
      graderProps.push(props);
      return <div data-testid="grader" />;
    },
  })
);
const printStudentReport = vi.fn<(job: unknown) => void>();
vi.mock('@/utils/quizStudentReportPrint', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/quizStudentReportPrint')>();
  return {
    ...actual,
    printStudentReport: (job: unknown) => printStudentReport(job),
  };
});

const downloadCsv = vi.fn<(csv: string, name: string) => void>();
vi.mock('@/utils/quizResultsCsv', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/quizResultsCsv')>();
  return {
    ...actual,
    downloadCsv: (csv: string, name: string) => downloadCsv(csv, name),
  };
});

import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Capitals',
  createdAt: 1,
  updatedAt: 1,
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'Capital of France?',
      correctAnswer: 'Paris',
      incorrectAnswers: ['Rome', 'Oslo'],
      timeLimit: 30,
      points: 1,
    },
    {
      id: 'w1',
      type: 'free-response',
      text: 'Explain why.',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      points: 2,
    },
  ],
};

const response = (pin: string, q1: string): QuizResponse =>
  ({
    studentUid: `uid-${pin}`,
    _responseKey: `pin-p1-${pin}`,
    pin,
    status: 'completed',
    submittedAt: 200,
    joinedAt: 1,
    tabSwitchWarnings: 0,
    answers: [
      { questionId: 'q1', answer: q1, answeredAt: 100 },
      { questionId: 'w1', answer: 'Because.', answeredAt: 101 },
    ],
  }) as unknown as QuizResponse;

// PIN 2222 answers correctly, so it sorts first on the Students screen.
const responses = [response('1111', 'Rome'), response('2222', 'Paris')];

const session = {
  id: 'session-1',
  quizId: 'quiz-1',
  teacherUid: 'teacher-1',
  classIds: [],
} as unknown as QuizSession;

const makeActions = () => ({
  publish: vi.fn().mockResolvedValue({ responsesUpdated: 1, skipped: 0 }),
  hide: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(undefined),
});

const renderResults = (
  actions?: ReturnType<typeof makeActions>,
  screenName: RegExp | null = /^students/i,
  extra: Partial<React.ComponentProps<typeof QuizResults>> = {}
) => {
  const utils = render(
    <QuizResults
      quiz={quiz}
      responses={responses}
      config={{ view: 'results' } as unknown as QuizConfig}
      onBack={vi.fn()}
      session={session}
      tabWarningsEnabled
      studentResultsActions={actions}
      {...extra}
    />
  );
  if (screenName)
    fireEvent.click(screen.getByRole('button', { name: screenName }));
  return utils;
};

describe('QuizResults — bulk Export and Reopen', () => {
  beforeEach(() => {
    features.clear();
    downloadCsv.mockReset();
    localStorage.clear();
  });

  it('hides Export and Reopen while the tools flag is off', () => {
    renderResults(makeActions(), /^students/i, {
      onReopenStudent: vi.fn(),
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select PIN 1111' }));
    const bar = screen.getByRole('toolbar');
    expect(within(bar).queryByRole('button', { name: /Export/ })).toBeNull();
    expect(within(bar).queryByRole('button', { name: /Reopen/ })).toBeNull();
  });

  it('exports only the selected students as CSV', () => {
    features.add('quiz-results-tools');
    renderResults(makeActions());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select PIN 1111' }));
    fireEvent.click(
      within(screen.getByRole('toolbar')).getByRole('button', {
        name: /Export/,
      })
    );
    expect(downloadCsv).toHaveBeenCalledOnce();
    const [csv, name] = downloadCsv.mock.calls[0];
    expect(name).toBe('Capitals results');
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Rome');
  });

  it('reopens each selected submitted student', async () => {
    features.add('quiz-results-tools');
    const onReopenStudent = vi.fn().mockResolvedValue(undefined);
    renderResults(makeActions(), /^students/i, { onReopenStudent });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select PIN 1111' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select PIN 2222' }));
    fireEvent.click(
      within(screen.getByRole('toolbar')).getByRole('button', {
        name: /Reopen/,
      })
    );
    await waitFor(() => expect(onReopenStudent).toHaveBeenCalledTimes(2));
    expect(onReopenStudent).toHaveBeenCalledWith('pin-p1-1111');
    expect(onReopenStudent).toHaveBeenCalledWith('pin-p1-2222');
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
  });

  it('blocks Reopen once the assignment has ended', () => {
    features.add('quiz-results-tools');
    const onReopenStudent = vi.fn();
    renderResults(makeActions(), /^students/i, {
      onReopenStudent,
      session: { ...session, status: 'ended' } as QuizSession,
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select PIN 1111' }));
    const reopen = within(screen.getByRole('toolbar')).getByRole('button', {
      name: /Reopen/,
    });
    expect(reopen).toBeDisabled();
    expect(reopen).toHaveAttribute(
      'title',
      'This assignment has ended. Reopen the assignment first.'
    );
  });

  it('replaces the selection with a Select these group', () => {
    features.add('quiz-results-tools');
    renderResults(makeActions(), /^students/i);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select PIN 2222' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByText('Question results'));
    fireEvent.click(screen.getByRole('button', { name: /Capital of France/ }));
    fireEvent.click(
      within(screen.getByTestId('drilldown-column-incorrect')).getByRole(
        'button',
        { name: 'Select these students' }
      )
    );
    expect(screen.getByRole('toolbar')).toHaveTextContent('1 selected');
    expect(
      screen.getByRole('checkbox', { name: 'Select PIN 1111' })
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Select PIN 2222' })
    ).not.toBeChecked();
  });
});
