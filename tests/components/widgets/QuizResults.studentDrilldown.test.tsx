import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessQuizMediaResponse: () => false,
    refreshGoogleToken: () => Promise.resolve(null),
    googleAccessToken: null,
    ensureGoogleScope: vi.fn(),
    user: { uid: 'teacher-1' },
    orgId: null,
    isExternalUser: false,
    canAccessFeature: () => false,
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
  screenName: RegExp | null = /^students/i
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
    />
  );
  if (screenName)
    fireEvent.click(screen.getByRole('button', { name: screenName }));
  return utils;
};

const rowToggle = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}$`) });

describe('QuizResults — student drill-down', () => {
  beforeEach(() => {
    graderProps.length = 0;
    printStudentReport.mockReset();
    localStorage.clear();
  });

  it('expands one student at a time with each served question', () => {
    renderResults();
    const ada = rowToggle('PIN 1111');
    expect(ada).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(ada);
    expect(ada).toHaveAttribute('aria-expanded', 'true');

    const panel = document.getElementById(
      ada.getAttribute('aria-controls') ?? ''
    );
    expect(panel).not.toBeNull();
    const p = within(panel as HTMLElement);
    expect(p.getByText('Capital of France?')).toBeInTheDocument();
    expect(p.getByText('Incorrect')).toBeInTheDocument();
    expect(p.getByText('Rome')).toBeInTheDocument();
    expect(p.getByText('Correct answer: Paris')).toBeInTheDocument();
    expect(p.getByText('Ungraded')).toBeInTheDocument();
    expect(p.getByText('0/2')).toBeInTheDocument();

    fireEvent.click(rowToggle('PIN 2222'));
    expect(ada).toHaveAttribute('aria-expanded', 'false');
    expect(rowToggle('PIN 2222')).toHaveAttribute('aria-expanded', 'true');
  });

  it('puts the results control at the top and ignores clicks on row controls', () => {
    renderResults(makeActions());
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select PIN 1111' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Results options for PIN 1111' })
    );
    expect(rowToggle('PIN 1111')).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(rowToggle('PIN 1111'));
    expect(
      screen.getByText('Results for this student:', { exact: false })
    ).toBeInTheDocument();
  });

  it('opens the grader on that student and written question', () => {
    renderResults();
    fireEvent.click(rowToggle('PIN 1111'));
    fireEvent.click(screen.getByRole('button', { name: /Explain why/ }));
    expect(screen.getByTestId('grader')).toBeInTheDocument();
    expect(graderProps.at(-1)?.initialTarget).toEqual({
      questionId: 'w1',
      responseKey: 'pin-p1-1111',
    });
    // Auto-graded lines are not buttons.
    expect(
      screen.queryByRole('button', { name: /Capital of France/ })
    ).toBeNull();
  });

  it('hides names everywhere with stable numbering and remembers the choice', () => {
    const { unmount } = renderResults(undefined, null);
    fireEvent.click(screen.getByRole('button', { name: 'Hide student names' }));
    expect(
      localStorage.getItem('spartboard.quizResults.hideNames.teacher-1')
    ).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: /^students/i }));
    expect(screen.queryByText(/PIN \d{4}/)).toBeNull();
    // Sorted by score, 2222 is listed first but keeps its name-order number.
    const labels = screen
      .getAllByRole('button', { name: /^Student \d$/ })
      .map((b) => b.textContent);
    expect(labels).toEqual(['Student 2', 'Student 1']);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByText('Question results'));
    fireEvent.click(screen.getByRole('button', { name: /Capital of France/ }));
    expect(
      within(screen.getByTestId('drilldown-column-correct')).getByText(
        'Student 2'
      )
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('drilldown-column-incorrect')).getByText(
        'Student 1'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/PIN \d{4}/)).toBeNull();

    unmount();
    renderResults();
    expect(screen.queryByText(/PIN \d{4}/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Hide student names' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects a column of students and shows them in the bulk bar', () => {
    renderResults(makeActions(), /question results/i);
    fireEvent.click(screen.getByRole('button', { name: /Capital of France/ }));
    const incorrect = screen.getByTestId('drilldown-column-incorrect');
    fireEvent.click(
      within(incorrect).getByRole('button', { name: 'Select these students' })
    );
    expect(screen.getByRole('toolbar')).toHaveTextContent('1 selected');
    expect(
      screen.getByRole('checkbox', { name: 'Select PIN 1111' })
    ).toBeChecked();
  });

  it('offers no group action without per-student publishing', () => {
    renderResults(undefined, /question results/i);
    fireEvent.click(screen.getByRole('button', { name: /Capital of France/ }));
    expect(
      screen.queryByRole('button', { name: 'Select these students' })
    ).toBeNull();
  });

  it('prints the report with or without correct answers', () => {
    renderResults();
    fireEvent.click(rowToggle('PIN 1111'));
    fireEvent.click(screen.getByRole('button', { name: 'Print report' }));
    expect(printStudentReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        quizTitle: 'Capitals',
        studentName: 'PIN 1111',
        includeCorrectAnswers: true,
      })
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Include correct answers' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Print report' }));
    expect(printStudentReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeCorrectAnswers: false })
    );
  });

  it('prints the masked label while names are hidden', () => {
    renderResults(undefined, null);
    fireEvent.click(screen.getByRole('button', { name: 'Hide student names' }));
    fireEvent.click(screen.getByRole('button', { name: /^students/i }));
    fireEvent.click(rowToggle('Student 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Print report' }));
    expect(printStudentReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ studentName: 'Student 1' })
    );
  });
});
